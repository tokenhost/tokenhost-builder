
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract MultiType_contract {

	uint public id;
	bool public active;
	string public description;
	string public image;
	address public owner;
	address public refContract;

	constructor(address _owner, uint _id, bool _active, string memory _description, string memory _image, address _refContract) {
		owner = _owner;
		id = _id;
		active = _active;
		description = _description;
		image = _image;
		refContract = _refContract;
	}

	struct MultiTypeData {
		address self;
		uint id;
		bool active;
		string description;
		string image;
		address owner;
		address refContract;
	}

	function getAll() external view returns (MultiTypeData memory) {
		return MultiTypeData({
			self: address(this),
			id: id,
			active: active,
			description: description,
			image: image,
			owner: owner,
			refContract: refContract
		});
	}

}

contract RefContract_contract {

	string public data;
	uint public value;

	constructor(string memory _data, uint _value) {
		value = 100;
		data = _data;
		value = _value;
	}

	struct RefContractData {
		address self;
		string data;
		uint value;
	}

	function getAll() external view returns (RefContractData memory) {
		return RefContractData({
			self: address(this),
			data: data,
			value: value
		});
	}

}

contract App {

	address[] public MultiType_list;

	function get_MultiType_N(uint256 index) public view returns (MultiType_contract.MultiTypeData memory) {
		return MultiType_contract(MultiType_list[index]).getAll();
	}

	function get_first_MultiType_N(uint256 count, uint256 offset) public view returns (MultiType_contract.MultiTypeData[] memory) {
		require(offset + count <= MultiType_list.length, "Offset + count out of bounds");
		MultiType_contract.MultiTypeData[] memory results = new MultiType_contract.MultiTypeData[](count);
		for (uint i = 0; i < count; i++) {
			results[i] = MultiType_contract(MultiType_list[i + offset]).getAll();
		}
		return results;
	}

	function get_last_MultiType_N(uint256 count, uint256 offset) public view returns (MultiType_contract.MultiTypeData[] memory) {
		require(count + offset <= MultiType_list.length, "Count + offset out of bounds");
		MultiType_contract.MultiTypeData[] memory results = new MultiType_contract.MultiTypeData[](count);
		uint len = MultiType_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = MultiType_contract(MultiType_list[idx]).getAll();
		}
		return results;
	}

	function get_MultiType_list_length() public view returns (uint256) { return MultiType_list.length; }
	function get_MultiType_user_length(address user) public view returns (uint256) {
		return user_map[user].MultiType_list.length;
	}

	function get_MultiType_user_N(address user, uint256 index) public view returns (MultiType_contract.MultiTypeData memory) {
		return MultiType_contract(user_map[user].MultiType_list[index]).getAll();
	}

	function get_last_MultiType_user_N(address user, uint256 count, uint256 offset) public view returns (MultiType_contract.MultiTypeData[] memory) {
		require(count + offset <= user_map[user].MultiType_list.length, "Count + offset out of bounds");
		MultiType_contract.MultiTypeData[] memory results = new MultiType_contract.MultiTypeData[](count);
		uint len = user_map[user].MultiType_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = MultiType_contract(user_map[user].MultiType_list[idx]).getAll();
		}
		return results;
	}

	address[] public RefContract_list;

	function get_RefContract_N(uint256 index) public view returns (RefContract_contract.RefContractData memory) {
		return RefContract_contract(RefContract_list[index]).getAll();
	}

	function get_first_RefContract_N(uint256 count, uint256 offset) public view returns (RefContract_contract.RefContractData[] memory) {
		require(offset + count <= RefContract_list.length, "Offset + count out of bounds");
		RefContract_contract.RefContractData[] memory results = new RefContract_contract.RefContractData[](count);
		for (uint i = 0; i < count; i++) {
			results[i] = RefContract_contract(RefContract_list[i + offset]).getAll();
		}
		return results;
	}

	function get_last_RefContract_N(uint256 count, uint256 offset) public view returns (RefContract_contract.RefContractData[] memory) {
		require(count + offset <= RefContract_list.length, "Count + offset out of bounds");
		RefContract_contract.RefContractData[] memory results = new RefContract_contract.RefContractData[](count);
		uint len = RefContract_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = RefContract_contract(RefContract_list[idx]).getAll();
		}
		return results;
	}

	function get_RefContract_list_length() public view returns (uint256) { return RefContract_list.length; }
	function get_RefContract_user_length(address user) public view returns (uint256) {
		return user_map[user].RefContract_list.length;
	}

	function get_RefContract_user_N(address user, uint256 index) public view returns (RefContract_contract.RefContractData memory) {
		return RefContract_contract(user_map[user].RefContract_list[index]).getAll();
	}

	function get_last_RefContract_user_N(address user, uint256 count, uint256 offset) public view returns (RefContract_contract.RefContractData[] memory) {
		require(count + offset <= user_map[user].RefContract_list.length, "Count + offset out of bounds");
		RefContract_contract.RefContractData[] memory results = new RefContract_contract.RefContractData[](count);
		uint len = user_map[user].RefContract_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = RefContract_contract(user_map[user].RefContract_list[idx]).getAll();
		}
		return results;
	}

	struct MultiType_RefContract {
		bool exists;
		address[] MultiType_list;
	}
	mapping(address => MultiType_RefContract) public MultiType_RefContract_map;

	function get_length_MultiType_RefContract_map(address hash) public view returns (uint256) {
		return MultiType_RefContract_map[hash].MultiType_list.length;
	}

	function get_last_MultiType_RefContract_map_N(address hash, uint256 count, uint256 offset) public view returns (MultiType_contract.MultiTypeData[] memory) {
		MultiType_contract.MultiTypeData[] memory results = new MultiType_contract.MultiTypeData[](count);
		for (uint i = 0; i < count; i++) {
			MultiType_contract instance = MultiType_contract(MultiType_RefContract_map[hash].MultiType_list[MultiType_RefContract_map[hash].MultiType_list.length - i - offset - 1]);
			results[i] = instance.getAll();
		}
		return results;
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
	address[] public UserInfoList;
	uint256 public UserInfoListLength;

	event NewMultiType(address indexed sender, address indexed contractAddress);

	function new_MultiType(uint id, bool active, string memory description, string memory image, address refContract) public returns (address) {
		address mynew = address(new MultiType_contract({
			_owner : msg.sender,
			_id : id,
			_active : active,
			_description : description,
			_image : image,
			_refContract : refContract
		}));

		if(!MultiType_RefContract_map[refContract].exists) {
			MultiType_RefContract_map[refContract] = create_index_on_new_MultiType_RefContract();
		}
		MultiType_RefContract_map[refContract].MultiType_list.push(mynew);

		if(!user_map[msg.sender].exists) {
			user_map[msg.sender] = create_user_on_new_MultiType(mynew);
		}
		user_map[msg.sender].MultiType_list.push(mynew);
		user_map[msg.sender].MultiType_list_length += 1;

		MultiType_list.push(mynew);
		// The length of MultiType_list is tracked by the array length

		emit NewMultiType(msg.sender, mynew);

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

	event NewRefContract(address indexed sender, address indexed contractAddress);

	function new_RefContract(string memory data, uint value) public returns (address) {
		address mynew = address(new RefContract_contract({
			_data : data,
			_value : value
		}));

		if(!user_map[msg.sender].exists) {
			user_map[msg.sender] = create_user_on_new_RefContract(mynew);
		}
		user_map[msg.sender].RefContract_list.push(mynew);
		user_map[msg.sender].RefContract_list_length += 1;

		RefContract_list.push(mynew);
		// The length of RefContract_list is tracked by the array length

		emit NewRefContract(msg.sender, mynew);

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

