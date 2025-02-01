
//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;

contract MultiType_contract {

	uint id;
	bool active;
	string description;
	string image;
	address owner;
	address refContract;

	constructor(uint _id, bool _active, string memory _description, string memory _image, address _refContract) {
		owner = tx.origin;
		id = _id;
		active = _active;
		description = _description;
		image = _image;
		refContract = _refContract;
	}

	function getall() public view returns (address, uint, bool, string memory, string memory, address, address) {
		return (address(this), id, active, description, image, owner, refContract);
	}

	function get_id() public view returns (uint) {
		return id;
	}
	function get_active() public view returns (bool) {
		return active;
	}
	function get_description() public view returns (string memory) {
		return description;
	}
	function get_image() public view returns (string memory) {
		return image;
	}
	function get_owner() public view returns (address) {
		return owner;
	}
	function get_refContract() public view returns (address) {
		return refContract;
	}
}

contract RefContract_contract {

	string data;
	uint value;

	constructor(string memory _data, uint _value) {
		value = 100;
		data = _data;
		value = _value;
	}

	function getall() public view returns (address, string memory, uint) {
		return (address(this), data, value);
	}

	function get_data() public view returns (string memory) {
		return data;
	}
	function get_value() public view returns (uint) {
		return value;
	}
}

contract App {

	address[] MultiType_list;
	uint256 MultiType_list_length;

	function get_MultiType_list_length() public view returns (uint256) {
		return MultiType_list_length;
	}

	struct MultiType_getter {
		address _address;
		uint id;
		bool active;
		string description;
		string image;
		address owner;
		address refContract;
	}

	function get_MultiType_N(uint256 index) public view returns (address, uint, bool, string memory, string memory, address, address) {
		return MultiType_contract(MultiType_list[index]).getall();
	}

	function get_first_MultiType_N(uint256 count, uint256 offset) public view returns (MultiType_getter[] memory) {
		MultiType_getter[] memory getters = new MultiType_getter[](count);
		for (uint i = offset; i < count; i++) {
			MultiType_contract myMultiType = MultiType_contract(MultiType_list[i + offset]);
			getters[i - offset]._address = address(myMultiType);
			getters[i - offset].id = myMultiType.get_id();
			getters[i - offset].active = myMultiType.get_active();
			getters[i - offset].description = myMultiType.get_description();
			getters[i - offset].image = myMultiType.get_image();
			getters[i - offset].owner = myMultiType.get_owner();
			getters[i - offset].refContract = myMultiType.get_refContract();
		}
		return getters;
	}

	function get_last_MultiType_N(uint256 count, uint256 offset) public view returns (MultiType_getter[] memory) {
		MultiType_getter[] memory getters = new MultiType_getter[](count);
		for (uint i = 0; i < count; i++) {
			MultiType_contract myMultiType = MultiType_contract(MultiType_list[MultiType_list_length - i - offset - 1]);
			getters[i]._address = address(myMultiType);
			getters[i].id = myMultiType.get_id();
			getters[i].active = myMultiType.get_active();
			getters[i].description = myMultiType.get_description();
			getters[i].image = myMultiType.get_image();
			getters[i].owner = myMultiType.get_owner();
			getters[i].refContract = myMultiType.get_refContract();
		}
		return getters;
	}

	function get_MultiType_user_length(address user) public view returns (uint256) {
		return user_map[user].MultiType_list_length;
	}

	function get_MultiType_user_N(address user, uint256 index) public view returns (address, uint, bool, string memory, string memory, address, address) {
		return MultiType_contract(user_map[user].MultiType_list[index]).getall();
	}

	function get_last_MultiType_user_N(address user, uint256 count, uint256 offset) public view returns (MultiType_getter[] memory) {
		MultiType_getter[] memory getters = new MultiType_getter[](count);
		for (uint i = offset; i < count; i++) {
			getters[i - offset]._address = user_map[user].MultiType_list[i + offset];
			getters[i - offset].id = MultiType_contract(user_map[user].MultiType_list[i + offset]).get_id();
			getters[i - offset].active = MultiType_contract(user_map[user].MultiType_list[i + offset]).get_active();
			getters[i - offset].description = MultiType_contract(user_map[user].MultiType_list[i + offset]).get_description();
			getters[i - offset].image = MultiType_contract(user_map[user].MultiType_list[i + offset]).get_image();
			getters[i - offset].owner = MultiType_contract(user_map[user].MultiType_list[i + offset]).get_owner();
			getters[i - offset].refContract = MultiType_contract(user_map[user].MultiType_list[i + offset]).get_refContract();
		}
		return getters;
	}

	address[] RefContract_list;
	uint256 RefContract_list_length;

	function get_RefContract_list_length() public view returns (uint256) {
		return RefContract_list_length;
	}

	struct RefContract_getter {
		address _address;
		string data;
		uint value;
	}

	function get_RefContract_N(uint256 index) public view returns (address, string memory, uint) {
		return RefContract_contract(RefContract_list[index]).getall();
	}

	function get_first_RefContract_N(uint256 count, uint256 offset) public view returns (RefContract_getter[] memory) {
		RefContract_getter[] memory getters = new RefContract_getter[](count);
		for (uint i = offset; i < count; i++) {
			RefContract_contract myRefContract = RefContract_contract(RefContract_list[i + offset]);
			getters[i - offset]._address = address(myRefContract);
			getters[i - offset].data = myRefContract.get_data();
			getters[i - offset].value = myRefContract.get_value();
		}
		return getters;
	}

	function get_last_RefContract_N(uint256 count, uint256 offset) public view returns (RefContract_getter[] memory) {
		RefContract_getter[] memory getters = new RefContract_getter[](count);
		for (uint i = 0; i < count; i++) {
			RefContract_contract myRefContract = RefContract_contract(RefContract_list[RefContract_list_length - i - offset - 1]);
			getters[i]._address = address(myRefContract);
			getters[i].data = myRefContract.get_data();
			getters[i].value = myRefContract.get_value();
		}
		return getters;
	}

	function get_RefContract_user_length(address user) public view returns (uint256) {
		return user_map[user].RefContract_list_length;
	}

	function get_RefContract_user_N(address user, uint256 index) public view returns (address, string memory, uint) {
		return RefContract_contract(user_map[user].RefContract_list[index]).getall();
	}

	function get_last_RefContract_user_N(address user, uint256 count, uint256 offset) public view returns (RefContract_getter[] memory) {
		RefContract_getter[] memory getters = new RefContract_getter[](count);
		for (uint i = offset; i < count; i++) {
			getters[i - offset]._address = user_map[user].RefContract_list[i + offset];
			getters[i - offset].data = RefContract_contract(user_map[user].RefContract_list[i + offset]).get_data();
			getters[i - offset].value = RefContract_contract(user_map[user].RefContract_list[i + offset]).get_value();
		}
		return getters;
	}

	struct MultiType_RefContract {
		bool exists;
		address[] MultiType_list;
	}
	mapping(address => MultiType_RefContract) public MultiType_RefContract_map;

	function get_length_MultiType_RefContract_map(address hash) public view returns (uint256) {
		return MultiType_RefContract_map[hash].MultiType_list.length;
	}

	function get_last_MultiType_RefContract_map_N(address hash, uint256 count, uint256 offset) public view returns (MultiType_getter[] memory) {
		MultiType_getter[] memory getters = new MultiType_getter[](count);
		for (uint i = 0; i < count; i++) {
			MultiType_contract myMultiType = MultiType_contract(MultiType_RefContract_map[hash].MultiType_list[MultiType_RefContract_map[hash].MultiType_list.length - i - offset - 1]);
			getters[i]._address = address(myMultiType);
			getters[i].id = myMultiType.get_id();
			getters[i].active = myMultiType.get_active();
			getters[i].description = myMultiType.get_description();
			getters[i].image = myMultiType.get_image();
			getters[i].owner = myMultiType.get_owner();
			getters[i].refContract = myMultiType.get_refContract();
		}
		return getters;
	}

	struct UserInfo {
		address owner;
		bool exists;
		address[] MultiType_list;
		uint256 MultiType_list_length;
		address[] RefContract_list;
		uint256 RefContract_list_length;
	}
	mapping(address => UserInfo) public user_map;
	address[] UserInfoList;
	uint256 UserInfoListLength;

	event NewMultiType(address sender);

	mapping(bytes32 => address) unique_map_MultiType;

	function get_unique_map_MultiType(uint id) public view returns (address) {
		bytes32 hash_MultiType = keccak256(abi.encodePacked(id));
		return unique_map_MultiType[hash_MultiType];
	}

	function new_MultiType(uint id, bool active, string memory description, string memory image, address refContract) public returns (address) {
		bytes32 hash_MultiType = keccak256(abi.encodePacked(id));
		require(unique_map_MultiType[hash_MultiType] == address(0));
		address mynew = address(new MultiType_contract({
			_id : id,
			_active : active,
			_description : description,
			_image : image,
			_refContract : refContract
		}));

		unique_map_MultiType[hash_MultiType] = mynew;

		if(!MultiType_RefContract_map[refContract].exists) {
			MultiType_RefContract_map[refContract] = create_index_on_new_MultiType_RefContract();
		}
		MultiType_RefContract_map[refContract].MultiType_list.push(mynew);

		if(!user_map[tx.origin].exists) {
			user_map[tx.origin] = create_user_on_new_MultiType(mynew);
		}
		user_map[tx.origin].MultiType_list.push(mynew);
		user_map[tx.origin].MultiType_list_length += 1;

		MultiType_list.push(mynew);
		MultiType_list_length += 1;

		emit NewMultiType(tx.origin);

		return mynew;
	}

	function create_user_on_new_MultiType(address addr) private returns (UserInfo memory) {
		address[] memory MultiType_list_ = new address[](0);
		address[] memory RefContract_list_ = new address[](0);
		UserInfoList.push(addr);
		return UserInfo({
			exists: true,
			owner: addr,
			MultiType_list: MultiType_list_,
			MultiType_list_length: 0,
			RefContract_list: RefContract_list_,
			RefContract_list_length: 0
		});
	}

	function create_index_on_new_MultiType_RefContract() private pure returns (MultiType_RefContract memory) {
		address[] memory tmp = new address[](0);
		return MultiType_RefContract({exists: true, MultiType_list: tmp});
	}

	event NewRefContract(address sender);

	mapping(bytes32 => address) unique_map_RefContract;

	function get_unique_map_RefContract(string memory data) public view returns (address) {
		bytes32 hash_RefContract = keccak256(abi.encodePacked(data));
		return unique_map_RefContract[hash_RefContract];
	}

	function new_RefContract(string memory data, uint value) public returns (address) {
		bytes32 hash_RefContract = keccak256(abi.encodePacked(data));
		require(unique_map_RefContract[hash_RefContract] == address(0));
		address mynew = address(new RefContract_contract({
			_data : data,
			_value : value
		}));

		unique_map_RefContract[hash_RefContract] = mynew;

		if(!user_map[tx.origin].exists) {
			user_map[tx.origin] = create_user_on_new_RefContract(mynew);
		}
		user_map[tx.origin].RefContract_list.push(mynew);
		user_map[tx.origin].RefContract_list_length += 1;

		RefContract_list.push(mynew);
		RefContract_list_length += 1;

		emit NewRefContract(tx.origin);

		return mynew;
	}

	function create_user_on_new_RefContract(address addr) private returns (UserInfo memory) {
		address[] memory MultiType_list_ = new address[](0);
		address[] memory RefContract_list_ = new address[](0);
		UserInfoList.push(addr);
		return UserInfo({
			exists: true,
			owner: addr,
			MultiType_list: MultiType_list_,
			MultiType_list_length: 0,
			RefContract_list: RefContract_list_,
			RefContract_list_length: 0
		});
	}

}

